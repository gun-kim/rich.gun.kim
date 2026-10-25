import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { type Collection, type Db, ObjectId } from 'mongodb';
import { MONGO_DB } from '../../database/database.module';
import {
  type ConnectionError,
  type ConnectionOf,
  type ExternalConnection,
  externalConnectionSchema,
  type ExternalProvider,
} from './external-connection.document';

const COLLECTION = 'external_connections';

/** 새로 만들 때 호출하는 쪽이 채우는 필드. 상태·시각 필드는 저장소가 채운다. */
type NewConnection<P extends ExternalProvider> = Omit<
  ConnectionOf<P>,
  '_id' | 'status' | 'lastSyncedAt' | 'lastError' | 'createdAt' | 'updatedAt' | 'deletedAt'
>;

/** 연결 해제되지 않은 문서. 해제 시 deletedAt 을 채우므로 null 인 문서만 살아 있다. */
const notDeleted = { deletedAt: { $type: 'null' } } as const;

/** external_connections 컬렉션 접근 */
@Injectable()
export class ExternalConnectionRepository implements OnModuleInit {
  private readonly collection: Collection<ExternalConnection>;

  constructor(@Inject(MONGO_DB) db: Db) {
    this.collection = db.collection<ExternalConnection>(COLLECTION);
  }

  async onModuleInit(): Promise<void> {
    await this.collection.createIndexes([
      // 사용자당 서비스별로 살아 있는 연결은 하나만 둔다.
      {
        key: { userId: 1, provider: 1 },
        name: 'userId_provider_active',
        unique: true,
        partialFilterExpression: notDeleted,
      },
    ]);
  }

  /** 사용자의 살아 있는 연결 하나. 없으면 null 이다. */
  async findActive<P extends ExternalProvider>(
    userId: string,
    provider: P,
  ): Promise<ConnectionOf<P> | null> {
    const document = await this.collection.findOne({ userId, provider, ...notDeleted });
    return document && (externalConnectionSchema.parse(document) as ConnectionOf<P>);
  }

  /** 사용자의 살아 있는 연결 전체 */
  async findAllActive(userId: string): Promise<ExternalConnection[]> {
    const documents = await this.collection.find({ userId, ...notDeleted }).toArray();
    return documents.map((document) => externalConnectionSchema.parse(document));
  }

  /** 새 연결을 저장한다. 같은 서비스의 살아 있는 연결이 이미 있으면 중복 키 오류(11000)가 난다. */
  async create<P extends ExternalProvider>(input: NewConnection<P>): Promise<ConnectionOf<P>> {
    const now = new Date();
    const document = externalConnectionSchema.parse({
      ...input,
      _id: new ObjectId(),
      status: 'active',
      lastSyncedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }) as ConnectionOf<P>;
    await this.collection.insertOne(document);
    return document;
  }

  /** 외부 서비스 호출에 성공했음을 기록하고 이전 오류를 지운다. */
  async recordSuccess(id: ObjectId): Promise<void> {
    const now = new Date();
    await this.collection.updateOne(
      { _id: id, ...notDeleted },
      { $set: { status: 'active', lastSyncedAt: now, lastError: null, updatedAt: now } },
    );
  }

  /** 사용자가 재연결해야 하는 오류를 기록한다. */
  async recordError(id: ObjectId, error: Omit<ConnectionError, 'occurredAt'>): Promise<void> {
    const now = new Date();
    await this.collection.updateOne(
      { _id: id, ...notDeleted },
      { $set: { status: 'error', lastError: { ...error, occurredAt: now }, updatedAt: now } },
    );
  }

  /** 연결을 해제한다. 문서는 남기고, 같은 서비스를 다시 연결할 수 있게 된다. */
  async disconnect(id: ObjectId): Promise<void> {
    const now = new Date();
    await this.collection.updateOne(
      { _id: id, ...notDeleted },
      { $set: { status: 'disconnected', deletedAt: now, updatedAt: now } },
    );
  }
}

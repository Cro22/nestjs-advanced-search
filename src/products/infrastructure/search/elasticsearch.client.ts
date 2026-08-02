import { Client } from '@elastic/elasticsearch';
import { ConfigService } from '@nestjs/config';

export const ELASTICSEARCH_CLIENT = Symbol('ELASTICSEARCH_CLIENT');

export function createElasticsearchClient(config: ConfigService): Client {
  const username = config.get<string>('elasticsearch.username');
  const password = config.get<string>('elasticsearch.password');
  return new Client({
    node: config.get<string>('elasticsearch.node'),
    // Basic auth only when the cluster runs with security enabled; omitted
    // entirely for the open local stack.
    ...(username && password ? { auth: { username, password } } : {}),
    // Explicit, tunable timeouts so a slow or wedged cluster fails fast on the
    // request path instead of hanging a client connection.
    maxRetries: config.get<number>('elasticsearch.maxRetries', 3),
    requestTimeout: config.get<number>('elasticsearch.requestTimeoutMs', 30_000),
  });
}

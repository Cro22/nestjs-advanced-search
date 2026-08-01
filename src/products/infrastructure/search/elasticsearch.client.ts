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
    // Reasonable defaults for a demo cluster; tune per environment.
    maxRetries: 3,
    requestTimeout: 30_000,
  });
}

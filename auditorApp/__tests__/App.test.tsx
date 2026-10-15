/**
 * @format
 */

import {env} from '../src/config/env';

test('uses an API URL with the existing /api base path', () => {
  expect(env.apiUrl).toMatch(/\/api$/);
});

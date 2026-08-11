/**
 * ------------------------------------------------------------
 * API
 *
 * Protocol:
 *   ?module=api&action=hello
 *   ?module=api&action=time
 *   ?module=api&action=projects
 * ------------------------------------------------------------
 */

function handle_api(string $action, string $method): never
{
    switch ($action) {
        case '':
        case 'index':
            json_response([
                'name' => APP_NAME,
                'status' => 'ok',
                'api' => true,
                'actions' => ['hello', 'time', 'projects'],
            ]);

        case 'hello':
            if ($method !== 'GET') {
                json_response([
                    'error' => 'Method not allowed',
                    'action' => $action,
                    'method' => $method,
                ], 405);
            }

            json_response([
                'message' => 'Hello from PHP!',
                'time' => date(DATE_ATOM),
                'route' => request_param('u', '/'),
            ]);

        case 'time':
            if ($method !== 'GET') {
                json_response([
                    'error' => 'Method not allowed',
                    'action' => $action,
                    'method' => $method,
                ], 405);
            }

            json_response([
                'unix' => time(),
                'iso' => date(DATE_ATOM),
            ]);

        case 'projects':
            if ($method === 'GET') {
                json_response([
                    ['id' => 1, 'name' => 'First project'],
                    ['id' => 2, 'name' => 'Second project'],
                ]);
            }

            if ($method === 'POST') {
                $body = read_json_body();

                if (empty($body['name']) || !is_string($body['name'])) {
                    json_response(['error' => 'name is required'], 422);
                }

                json_response([
                    'id' => random_int(1000, 9999),
                    'name' => $body['name'],
                ], 201);
            }

            json_response([
                'error' => 'Method not allowed',
                'action' => $action,
                'method' => $method,
            ], 405);

        default:
            json_response([
                'error' => 'Unknown API action',
                'action' => $action,
            ], 404);
    }
}

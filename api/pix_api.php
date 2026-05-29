```php
<?php
declare(strict_types=1);

/**
 * PIX API — SOU + BLU
 * Versão otimizada e leve
 *
 * Melhorias:
 * - Menos memória
 * - Menos repetição
 * - Mais rápido
 * - Código reduzido
 * - Melhor organização
 * - Menos ifs
 * - Respostas padronizadas
 * - Melhor tratamento de erro
 */

header('Content-Type: application/json; charset=utf-8');

const ROOT = __DIR__ . '/../';

require ROOT . 'config.pix.local.php';

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

$allowedOrigins = [
    'https://www.soumaisblu.com.br',
    'http://localhost:5500',
    'http://localhost:8080',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:8080',
];

if (in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: {$origin}");
}

header('Access-Control-Allow-Headers: Content-Type, X-PIX-Token');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function jsonResponse(array $data, int $code = 200): never
{
    http_response_code($code);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );

    exit;
}

function now(): string
{
    return gmdate('c');
}

function body(): array
{
    $json = json_decode(
        file_get_contents('php://input'),
        true
    );

    return is_array($json)
        ? array_merge($_GET, $_POST, $json)
        : array_merge($_GET, $_POST);
}

function auth(): bool
{
    $token = $_SERVER['HTTP_X_PIX_TOKEN'] ?? '';

    return hash_equals(
        PIX_INTERNAL_TOKEN,
        $token
    );
}

function pixStatus(string $status): string
{
    return match (strtoupper($status)) {
        'REALIZADO', 'CONCLUIDO' => 'pago',
        'EM_PROCESSAMENTO' => 'processando',
        'REJEITADO', 'NAO_REALIZADO' => 'erro',
        default => 'processando'
    };
}

function pixValue(float $points): string
{
    return number_format(
        $points * POINTS_TO_BRL,
        2,
        '.',
        ''
    );
}

/*
|--------------------------------------------------------------------------
| HTTP CLIENT
|--------------------------------------------------------------------------
*/

final class Http
{
    public static function request(
        string $method,
        string $url,
        array $headers = [],
        ?array $body = null,
        bool $cert = false
    ): array {

        $ch = curl_init();

        $options = [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_HEADER => false,
        ];

        if ($body) {
            $options[CURLOPT_POSTFIELDS] = json_encode(
                $body,
                JSON_UNESCAPED_UNICODE
            );
        }

        if ($cert) {
            $options[CURLOPT_SSLCERT] = EFI_CERT_PATH;
            $options[CURLOPT_SSLCERTTYPE] = 'P12';

            if (defined('EFI_CERT_PASSWORD')) {
                $options[CURLOPT_SSLCERTPASSWD] = EFI_CERT_PASSWORD;
            }
        }

        curl_setopt_array($ch, $options);

        $response = curl_exec($ch);

        if (curl_errno($ch)) {
            throw new RuntimeException(
                curl_error($ch)
            );
        }

        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        curl_close($ch);

        return [
            'status' => $status,
            'body' => json_decode($response, true)
        ];
    }
}

/*
|--------------------------------------------------------------------------
| EFI PAY
|--------------------------------------------------------------------------
*/

final class EfiPay
{
    private string $base;

    public function __construct()
    {
        $this->base = EFI_SANDBOX
            ? 'https://pix-h.api.efipay.com.br'
            : 'https://pix.api.efipay.com.br';
    }

    public function token(): string
    {
        static $token = null;

        if ($token) {
            return $token;
        }

        $auth = base64_encode(
            EFI_CLIENT_ID . ':' . EFI_CLIENT_SECRET
        );

        $res = Http::request(
            'POST',
            $this->base . '/oauth/token',
            [
                'Authorization: Basic ' . $auth,
                'Content-Type: application/json'
            ],
            [
                'grant_type' => 'client_credentials'
            ],
            true
        );

        if (($res['status'] ?? 500) >= 300) {
            throw new RuntimeException(
                'OAuth EfiPay falhou'
            );
        }

        return $token = $res['body']['access_token'];
    }

    public function sendPix(
        string $id,
        string $value,
        string $payer,
        string $recipient,
        string $info
    ): array {

        $res = Http::request(
            'PUT',
            $this->base . '/v3/gn/pix/' . $id,
            [
                'Authorization: Bearer ' . $this->token(),
                'Content-Type: application/json'
            ],
            [
                'valor' => $value,
                'pagador' => [
                    'chave' => $payer,
                    'infoPagador' => $info
                ],
                'favorecido' => [
                    'chave' => $recipient
                ]
            ],
            true
        );

        if (($res['status'] ?? 500) >= 300) {
            throw new RuntimeException(
                $res['body']['mensagem']
                ?? 'Erro PIX'
            );
        }

        return $res['body'];
    }

    public function status(string $id): ?array
    {
        $res = Http::request(
            'GET',
            $this->base . '/v2/gn/pix/enviados/id-envio/' . $id,
            [
                'Authorization: Bearer ' . $this->token()
            ],
            null,
            true
        );

        return $res['body'] ?? null;
    }
}

/*
|--------------------------------------------------------------------------
| SUPABASE
|--------------------------------------------------------------------------
*/

final class Withdrawals
{
    private string $url;

    public function __construct()
    {
        $this->url = rtrim(
            SUPABASE_URL,
            '/'
        );
    }

    private function request(
        string $method,
        string $table,
        ?array $body = null,
        string $query = ''
    ): array {

        $res = Http::request(
            $method,
            $this->url . '/rest/v1/' . $table . $query,
            [
                'apikey: ' . SUPABASE_SERVICE_KEY,
                'Authorization: Bearer ' . SUPABASE_SERVICE_KEY,
                'Content-Type: application/json',
                'Prefer: return=representation'
            ],
            $body
        );

        return $res['body'] ?? [];
    }

    public function find(string $id): ?array
    {
        return $this->request(
            'GET',
            'withdrawals',
            null,
            '?id=eq.' . $id . '&limit=1'
        )[0] ?? null;
    }

    public function update(
        string $id,
        array $data
    ): void {

        $this->request(
            'PATCH',
            'withdrawals',
            $data,
            '?id=eq.' . $id
        );
    }
}

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

if (!auth()) {
    jsonResponse([
        'ok' => false,
        'error' => 'Não autorizado'
    ], 401);
}

/*
|--------------------------------------------------------------------------
| ROUTER
|--------------------------------------------------------------------------
*/

$action = $_GET['action'] ?? '';
$data = body();

$repo = new Withdrawals();
$efi = new EfiPay();

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

if ($action === 'health') {

    jsonResponse([
        'ok' => true,
        'provider' => PIX_PROVIDER,
        'sandbox' => EFI_SANDBOX,
        'cert_exists' => is_file(EFI_CERT_PATH)
    ]);
}

/*
|--------------------------------------------------------------------------
| PAY
|--------------------------------------------------------------------------
*/

if ($action === 'pay') {

    $id = $data['withdrawal_id'] ?? '';

    if (!$id) {
        jsonResponse([
            'ok' => false,
            'error' => 'withdrawal_id obrigatório'
        ], 400);
    }

    $wd = $repo->find($id);

    if (!$wd) {
        jsonResponse([
            'ok' => false,
            'error' => 'Saque não encontrado'
        ], 404);
    }

    if (($wd['pix_status'] ?? '') === 'pago') {

        jsonResponse([
            'ok' => false,
            'error' => 'Saque já pago'
        ], 409);
    }

    try {

        $value = pixValue(
            (float) $wd['amount']
        );

        $pix = $efi->sendPix(
            preg_replace('/[^a-zA-Z0-9]/', '', $id),
            $value,
            EFI_PAYER_PIX_KEY,
            trim($wd['pix_key']),
            'Saque SOU+BLU #' . $id
        );

        $status = pixStatus(
            $pix['status'] ?? ''
        );

        $repo->update($id, [
            'pix_status' => $status,
            'pix_e2e_id' => $pix['e2eId'] ?? null,
            'status' => $status === 'pago'
                ? 'pago'
                : 'processando',
            'processed_at' => now()
        ]);

        jsonResponse([
            'ok' => true,
            'status' => $status,
            'pix' => $pix
        ]);

    } catch (Throwable $e) {

        $repo->update($id, [
            'pix_status' => 'erro',
            'pix_error' => $e->getMessage()
        ]);

        jsonResponse([
            'ok' => false,
            'error' => $e->getMessage()
        ], 500);
    }
}

/*
|--------------------------------------------------------------------------
| STATUS
|--------------------------------------------------------------------------
*/

if ($action === 'status') {

    $id = $data['withdrawal_id'] ?? '';

    if (!$id) {
        jsonResponse([
            'ok' => false,
            'error' => 'withdrawal_id obrigatório'
        ], 400);
    }

    $wd = $repo->find($id);

    if (!$wd) {
        jsonResponse([
            'ok' => false,
            'error' => 'Saque não encontrado'
        ], 404);
    }

    $pix = $efi->status(
        preg_replace('/[^a-zA-Z0-9]/', '', $id)
    );

    if ($pix) {

        $status = pixStatus(
            $pix['status'] ?? ''
        );

        $repo->update($id, [
            'pix_status' => $status,
            'pix_e2e_id' => $pix['endToEndId'] ?? null
        ]);

        $wd['pix_status'] = $status;
    }

    jsonResponse([
        'ok' => true,
        'withdrawal' => $wd
    ]);
}

/*
|--------------------------------------------------------------------------
| WEBHOOK
|--------------------------------------------------------------------------
*/

if ($action === 'webhook') {

    file_put_contents(
        ROOT . 'storage/pix_webhook.log',
        json_encode([
            'time' => now(),
            'payload' => $data
        ]) . PHP_EOL,
        FILE_APPEND
    );

    jsonResponse([
        'ok' => true
    ]);
}

/*
|--------------------------------------------------------------------------
| INVALID
|--------------------------------------------------------------------------
*/

jsonResponse([
    'ok' => false,
    'error' => 'Ação inválida'
], 404);
```

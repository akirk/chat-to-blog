<?php
/**
 * Local Media Server for Chat to Blog
 *
 * Run with: php -S localhost:8787 local-media-server.php
 *
 * Usage: ?url=localmxc://...&token=YOUR_BEEPER_TOKEN
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
	http_response_code(200);
	exit;
}

// Health check endpoint
if (isset($_GET['health'])) {
	header('Content-Type: application/json');
	echo json_encode(['status' => 'ok', 'server' => 'chat-to-blog-local-media-server']);
	exit;
}

$id = $_GET['id'] ?? '';
$token = $_GET['token'] ?? '';

if (empty($id)) {
	http_response_code(400);
	echo json_encode(['error' => 'id parameter required']);
	exit;
}

if (strpos($id, 'localmxc://') !== 0 && strpos($id, 'mxc://') !== 0) {
	http_response_code(400);
	echo json_encode(['error' => 'Only localmxc:// and mxc:// URLs are supported']);
	exit;
}

if (empty($token)) {
	http_response_code(400);
	echo json_encode(['error' => 'Token parameter required']);
	exit;
}

$file_path = resolve_mxc_url($id, $token);
if (!$file_path) {
	http_response_code(404);
	echo json_encode(['error' => 'Could not resolve mxc URL']);
	exit;
}

serve_file($file_path);
exit;

/**
 * Resolve a localmxc:// URL to a local file path via Beeper API
 */
function resolve_mxc_url($mxc_url, $token) {
	$ch = curl_init('http://localhost:23373/v1/assets/download');
	curl_setopt_array($ch, [
		CURLOPT_POST => true,
		CURLOPT_RETURNTRANSFER => true,
		CURLOPT_HTTPHEADER => [
			'Content-Type: application/json',
			'Authorization: Bearer ' . $token,
		],
		CURLOPT_POSTFIELDS => json_encode(['url' => $mxc_url]),
		CURLOPT_TIMEOUT => 30,
	]);

	$response = curl_exec($ch);
	$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
	$content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

	if ($http_code !== 200) {
		return null;
	}

	// If JSON response with srcURL, extract the file path
	if (strpos($content_type, 'application/json') !== false) {
		$data = json_decode($response, true);
		if (!empty($data['srcURL'])) {
			$file_path = $data['srcURL'];
			if (strpos($file_path, 'file://') === 0) {
				$file_path = substr($file_path, 7);
			}
			return urldecode($file_path);
		}
		return null;
	}

	// Binary response - save to temp file and return path
	$tmp = tempnam(sys_get_temp_dir(), 'ctb_');
	file_put_contents($tmp, $response);
	return $tmp;
}

/**
 * Serve a local file
 */
function serve_file($path) {
	if (!file_exists($path)) {
		http_response_code(404);
		echo json_encode(['error' => 'File not found', 'path' => $path]);
		exit;
	}

	$finfo = finfo_open(FILEINFO_MIME_TYPE);
	$mime_type = finfo_file($finfo, $path);

	header('Content-Type: ' . ($mime_type ?: 'application/octet-stream'));
	header('Content-Length: ' . filesize($path));
	header('Cache-Control: public, max-age=86400');

	readfile($path);
	exit;
}

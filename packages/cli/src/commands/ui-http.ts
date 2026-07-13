import type http from "node:http";

export function sendApiResponse(
  response: http.ServerResponse,
  apiResponse: { statusCode: number; body: string; headers: Record<string, string> }
): void {
  response.writeHead(apiResponse.statusCode, apiResponse.headers);
  response.end(apiResponse.body);
}

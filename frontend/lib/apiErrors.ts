import { AxiosError } from "axios";

const NETWORK_ERROR_MESSAGE = "Cannot reach the server. Please try again.";

function isAxiosError(error: unknown): error is AxiosError {
  return !!error && typeof error === "object" && (error as AxiosError).isAxiosError === true;
}

export function getUserFacingApiError(error: unknown, fallbackMessage: string) {
  if (!isAxiosError(error)) {
    return fallbackMessage;
  }

  if (!error.response || error.code === "ECONNABORTED" || error.message === "Backend unavailable") {
    return NETWORK_ERROR_MESSAGE;
  }

  return fallbackMessage;
}

export function logApiError(context: string, error: unknown) {
  if (isAxiosError(error)) {
    console.error(context, {
      status: error.response?.status ?? null,
      code: error.code ?? null,
      message: error.message,
    });
    return;
  }

  console.error(context, { message: error instanceof Error ? error.message : String(error) });
}

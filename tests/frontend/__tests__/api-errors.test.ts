import axios from "axios";

import { getUserFacingApiError } from "@/lib/apiErrors";

describe("apiErrors", () => {
  it("hides backend detail strings from users", () => {
    const error = new axios.AxiosError(
      "Request failed with status code 500",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 500,
        statusText: "Internal Server Error",
        headers: {},
        config: {} as any,
        data: { detail: "traceback: db password leaked" },
      }
    );

    expect(getUserFacingApiError(error, "Failed to create customer.")).toBe("Failed to create customer.");
  });

  it("returns a safe network message when the backend is unavailable", () => {
    const error = new axios.AxiosError("Backend unavailable", "ERR_NETWORK");

    expect(getUserFacingApiError(error, "Failed to create customer.")).toBe(
      "Cannot reach the server. Please try again."
    );
  });
});

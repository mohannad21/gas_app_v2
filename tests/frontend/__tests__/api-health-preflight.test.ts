const mockApiGet = jest.fn();
const mockHealthGet = jest.fn();
const mockAuthGet = jest.fn();
const mockResponseUse = jest.fn();
let requestHandler: ((config: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>) | null =
  null;

jest.mock("axios", () => {
  const create = jest
    .fn()
    .mockImplementationOnce(() => ({
      interceptors: {
        request: {
          use: jest.fn((handler: typeof requestHandler) => {
            requestHandler = handler;
          }),
        },
        response: {
          use: mockResponseUse,
        },
      },
      get: mockApiGet,
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    }))
    .mockImplementationOnce(() => ({
      get: mockHealthGet,
    }))
    .mockImplementationOnce(() => ({
      get: mockAuthGet,
    }));

  return {
    __esModule: true,
    default: { create },
    create,
  };
});

describe("api health preflight", () => {
  beforeEach(() => {
    jest.resetModules();
    mockApiGet.mockReset();
    mockHealthGet.mockReset();
    mockAuthGet.mockReset();
    mockResponseUse.mockReset();
    requestHandler = null;
    delete process.env.EXPO_PUBLIC_API_TOKEN;
    delete process.env.EXPO_PUBLIC_API_DEBUG_AUTH;
  });

  it("does not block requests when the health preflight fails transiently", async () => {
    process.env.EXPO_PUBLIC_API_DEBUG_AUTH = "false";
    mockHealthGet.mockRejectedValueOnce(new Error("temporary health failure"));

    jest.isolateModules(() => {
      require("@/lib/api");
    });

    const config = { url: "/customers" };
    await expect(Promise.resolve(requestHandler?.(config))).resolves.toBe(config);
    await expect(Promise.resolve(requestHandler?.(config))).resolves.toBe(config);

    expect(mockHealthGet).toHaveBeenCalledTimes(1);
    expect(mockHealthGet).toHaveBeenCalledWith("/health");
    expect(mockAuthGet).not.toHaveBeenCalled();
  });

  it("attaches a dev auth token to protected requests when no explicit token is configured", async () => {
    mockHealthGet.mockResolvedValueOnce({ data: { status: "ok" } });
    mockAuthGet.mockResolvedValueOnce({ data: { access_token: "dev-token" } });

    jest.isolateModules(() => {
      require("@/lib/api");
    });

    const config = { url: "/customers", headers: {} };
    await expect(Promise.resolve(requestHandler?.(config))).resolves.toMatchObject({
      headers: { Authorization: "Bearer dev-token" },
    });

    expect(mockAuthGet).toHaveBeenCalledWith("/auth/dev-token");
  });
});

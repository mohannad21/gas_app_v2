const mockApiGet = jest.fn();
const mockHealthGet = jest.fn();
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
    mockResponseUse.mockReset();
    requestHandler = null;
  });

  it("does not block requests when the health preflight fails transiently", async () => {
    mockHealthGet.mockRejectedValueOnce(new Error("temporary health failure"));

    jest.isolateModules(() => {
      require("@/lib/api");
    });

    const config = { url: "/customers" };
    await expect(Promise.resolve(requestHandler?.(config))).resolves.toBe(config);
    await expect(Promise.resolve(requestHandler?.(config))).resolves.toBe(config);

    expect(mockHealthGet).toHaveBeenCalledTimes(1);
    expect(mockHealthGet).toHaveBeenCalledWith("/health");
  });
});

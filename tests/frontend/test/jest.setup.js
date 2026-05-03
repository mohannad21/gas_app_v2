const React = require("react");
const { View } = require("react-native");

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {},
    executionEnvironment: "storeClient",
  },
  ExecutionEnvironment: {
    StoreClient: "storeClient",
    Standalone: "standalone",
    Bare: "bare",
  },
}));

const renderList = ({ data = [], renderItem, keyExtractor }) =>
  React.createElement(
    View,
    null,
    data.map((item, index) =>
      React.createElement(
        View,
        { key: keyExtractor ? keyExtractor(item, index) : index },
        renderItem({ item, index })
      )
    )
  );

const RenderList = (props) => renderList(props);

jest.mock(
  "react-native/Libraries/Lists/FlatList",
  () => ({
    __esModule: true,
    default: RenderList,
  }),
  { virtual: true }
);

jest.mock(
  "react-native/Libraries/Lists/VirtualizedList",
  () => ({
    VirtualizedList: RenderList,
    default: RenderList,
  }),
  { virtual: true }
);

jest.mock(
  "@react-native/virtualized-lists/Lists/VirtualizedList",
  () => ({
    VirtualizedList: RenderList,
    default: RenderList,
  }),
  { virtual: true }
);

const React = require("react");
const { View } = require("react-native");

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

jest.mock("react-native/Libraries/Lists/FlatList", () => ({
  __esModule: true,
  default: RenderList,
}));

jest.mock("react-native/Libraries/Lists/VirtualizedList", () => ({
  VirtualizedList: RenderList,
  default: RenderList,
}));

jest.mock("@react-native/virtualized-lists/Lists/VirtualizedList", () => ({
  VirtualizedList: RenderList,
  default: RenderList,
}));

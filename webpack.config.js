const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  entry: {
    fn1: "./src/test.ts"
  },
  performance: {
    hints: false
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/
      },
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },
    ]
  },
  resolve: {
    extensions: [".js", ".ts", ".tsx"]
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "build")
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/static/", to: "" }
      ]
    })
  ]
};

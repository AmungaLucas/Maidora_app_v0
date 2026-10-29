// Expo's standard Babel configuration. babel-preset-expo includes the JSX and
// Flow/TypeScript transforms, and automatically applies the worklets plugin
// whenever react-native-reanimated 4 / react-native-worklets is installed.
// Keeping this file explicit makes every rebuild (including `expo start -c`
// cache clears) apply the same transform chain deterministically.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

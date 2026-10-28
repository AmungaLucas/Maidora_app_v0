// Expo's standard Babel configuration. babel-preset-expo includes the JSX and
// Flow/TypeScript transforms — and previously auto-enabled the worklets plugin
// when Reanimated was installed. Reanimated has been removed from the project
// (all animations now use React Native's built-in Animated API) so nothing
// extra is needed here.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};

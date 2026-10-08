// Runtime stand-ins for the tabby-core exports the plugin sources reference as values
class ConfigService { }
class PlatformService { }
class ConfigProvider { }
const Platform = { macOS: 'macOS', Windows: 'Windows', Linux: 'Linux' }
module.exports = { ConfigService, PlatformService, ConfigProvider, Platform }

// No-op Angular decorators, enough to load the services outside Angular
const decorator = () => target => target
module.exports = { Injectable: decorator, Component: decorator, NgModule: decorator, HostBinding: () => () => undefined }

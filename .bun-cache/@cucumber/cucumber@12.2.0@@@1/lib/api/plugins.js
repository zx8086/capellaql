"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeForLoadSources = initializeForLoadSources;
exports.initializeForLoadSupport = initializeForLoadSupport;
exports.initializeForRunCucumber = initializeForRunCucumber;
const plugin_1 = require("../plugin");
const publish_1 = __importDefault(require("../publish"));
const filter_1 = __importDefault(require("../filter"));
const sharding_1 = __importDefault(require("../sharding"));
async function initializeForLoadSources(coordinates, environment) {
    // eventually we'll load plugin packages here
    const pluginManager = new plugin_1.PluginManager(environment);
    await pluginManager.initCoordinator('loadSources', filter_1.default, coordinates);
    return pluginManager;
}
async function initializeForLoadSupport(environment) {
    // eventually we'll load plugin packages here
    return new plugin_1.PluginManager(environment);
}
async function initializeForRunCucumber(configuration, environment) {
    // eventually we'll load plugin packages here
    const pluginManager = new plugin_1.PluginManager(environment);
    await pluginManager.initCoordinator('runCucumber', publish_1.default, configuration.formats.publish);
    await pluginManager.initCoordinator('runCucumber', filter_1.default, configuration.sources);
    await pluginManager.initCoordinator('runCucumber', sharding_1.default, configuration.sources);
    return pluginManager;
}
//# sourceMappingURL=plugins.js.map
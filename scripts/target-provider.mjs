// Transport internals are reachable only through the target-safety module boundary.
export {providerMetadata,providerCompose,readProviderSecrets,prepareProviderCli} from "./local/safety-internal/restaurant-provider.mjs";

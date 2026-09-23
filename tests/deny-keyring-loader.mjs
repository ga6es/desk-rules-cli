export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@napi-rs/keyring") {
    throw new Error("native keyring intentionally unavailable")
  }
  return nextResolve(specifier, context)
}

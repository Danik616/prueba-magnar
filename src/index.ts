import { config } from "./config";

function main() {
  console.log("Scraper configurado. Base URL:", config.baseUrl);
  // TODO: orquestar scrape -> download -> retry
}

main();

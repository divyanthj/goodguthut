module.exports = {
  siteUrl: process.env.SITE_URL || "https://goodguthut.com",
  generateRobotsTxt: true,
  exclude: [
    "/api/*",
    "/twitter-image.*",
    "/opengraph-image.*",
    "/icon.*",
  ],
};

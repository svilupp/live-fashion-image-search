import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/vector-search", "routes/api.vector-search.ts"),
  route("logs", "routes/logs.tsx"),
] satisfies RouteConfig;

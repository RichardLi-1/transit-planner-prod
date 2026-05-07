import type { Route } from "~/app/map/transit-data";

export type PlanSession = {
  id: string;
  name: string;
  routes: Route[];
  hiddenRoutes: string[];
  createdAt: string;
  updatedAt: string;
};

export type PlanSessionSummary = {
  id: string;
  name: string;
  routeCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CreatePlanBody = {
  name: string;
  routes: Route[];
  hiddenRoutes: string[];
};

export type UpdatePlanBody = {
  name?: string;
  routes?: Route[];
  hiddenRoutes?: string[];
};

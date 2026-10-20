// Wires repositories into services and registers the hooks, in one place. server.ts passes the
// PostgreSQL repositories, and tests pass in-memory fakes (test/support/fakes.ts): the services
// cannot tell the difference, which is the point of depending on interfaces.
import type { Logger } from "pino";
import type { Config } from "./config.ts";
import { type Db, raceWindow } from "./db/tx.ts";
import { HookRegistry } from "./hooks/registry.ts";
import { auditRepository, type AuditRepository } from "./modules/audit/audit.repository.ts";
import { AuditService, registerAuditHooks } from "./modules/audit/audit.service.ts";
import { AuthService } from "./modules/auth/auth.service.ts";
import { PasswordHasher } from "./modules/auth/passwords.ts";
import { refreshTokensRepository, type RefreshTokensRepository } from "./modules/auth/refresh-tokens.repository.ts";
import { TokenService } from "./modules/auth/tokens.ts";
import { usersRepository, type UsersRepository } from "./modules/auth/users.repository.ts";
import { registerEventHooks } from "./modules/events/events.hooks.ts";
import { eventsRepository, type EventsRepository } from "./modules/events/events.repository.ts";
import { EventsService } from "./modules/events/events.service.ts";
import { PosterStorage } from "./modules/events/posters.ts";
import { favoritesRepository, type FavoritesRepository } from "./modules/favorites/favorites.repository.ts";
import { FavoritesService } from "./modules/favorites/favorites.service.ts";
import { notificationsRepository, type NotificationsRepository } from "./modules/notifications/notifications.repository.ts";
import { CheckoutService } from "./modules/orders/checkout.service.ts";
import { ordersRepository, type OrdersRepository } from "./modules/orders/orders.repository.ts";
import { OrdersService } from "./modules/orders/orders.service.ts";
import { StatsService } from "./modules/stats/stats.service.ts";
import { ticketTypesRepository, type TicketTypesRepository } from "./modules/ticket-types/ticket-types.repository.ts";
import { TicketTypesService } from "./modules/ticket-types/ticket-types.service.ts";
import { venuesRepository, type VenuesRepository } from "./modules/venues/venues.repository.ts";
import { VenuesService } from "./modules/venues/venues.service.ts";

export type Repositories = {
  users: UsersRepository;
  refreshTokens: RefreshTokensRepository;
  venues: VenuesRepository;
  events: EventsRepository;
  ticketTypes: TicketTypesRepository;
  orders: OrdersRepository;
  favorites: FavoritesRepository;
  audit: AuditRepository;
  notifications: NotificationsRepository;
};

export const pgRepositories: Repositories = {
  users: usersRepository,
  refreshTokens: refreshTokensRepository,
  venues: venuesRepository,
  events: eventsRepository,
  ticketTypes: ticketTypesRepository,
  orders: ordersRepository,
  favorites: favoritesRepository,
  audit: auditRepository,
  notifications: notificationsRepository,
};

export type Services = {
  auth: AuthService;
  venues: VenuesService;
  events: EventsService;
  ticketTypes: TicketTypesService;
  checkout: CheckoutService;
  orders: OrdersService;
  favorites: FavoritesService;
  stats: StatsService;
};

export type ServiceDeps = {
  db: Db;
  repositories: Repositories;
  config: Pick<Config, "jwt" | "refreshTokenTtlDays" | "raceDelayMs" | "uploadDir">;
  logger: Logger;
  passwords?: PasswordHasher;
  posters?: PosterStorage;
};

export function createServices(deps: ServiceDeps): {
  services: Services;
  hooks: HookRegistry;
  tokens: TokenService;
  posters: PosterStorage;
} {
  const { db, repositories: repos, config, logger } = deps;

  const hooks = new HookRegistry();
  registerEventHooks(hooks, { events: repos.events });
  registerAuditHooks(hooks, new AuditService(repos.audit));

  const tokens = new TokenService(config.jwt);
  const posters = deps.posters ?? new PosterStorage(config.uploadDir);

  const services: Services = {
    auth: new AuthService({
      db,
      users: repos.users,
      refreshTokens: repos.refreshTokens,
      passwords: deps.passwords ?? new PasswordHasher(),
      tokens,
      refreshTokenTtlDays: config.refreshTokenTtlDays,
    }),
    venues: new VenuesService({ db, venues: repos.venues }),
    events: new EventsService({
      db,
      events: repos.events,
      venues: repos.venues,
      ticketTypes: repos.ticketTypes,
      orders: repos.orders,
      notifications: repos.notifications,
      hooks,
      posters,
      logger,
    }),
    ticketTypes: new TicketTypesService({ db, events: repos.events, ticketTypes: repos.ticketTypes }),
    checkout: new CheckoutService({
      db,
      ticketTypes: repos.ticketTypes,
      orders: repos.orders,
      hooks,
      raceWindow: raceWindow(config.raceDelayMs),
    }),
    orders: new OrdersService({ db, orders: repos.orders, events: repos.events, ticketTypes: repos.ticketTypes, hooks }),
    favorites: new FavoritesService({ db, favorites: repos.favorites, events: repos.events, ticketTypes: repos.ticketTypes }),
    stats: new StatsService({ db, events: repos.events, ticketTypes: repos.ticketTypes }),
  };
  return { services, hooks, tokens, posters };
}

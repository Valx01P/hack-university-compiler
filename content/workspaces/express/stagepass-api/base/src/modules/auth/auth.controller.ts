// The controller for auth: HTTP in, a service call, status and view out. Nothing else.
import type { RequestHandler } from "express";
import { currentUser } from "../../http/auth.ts";
import type { Login, RefreshTokenBody, Signup } from "./auth.schemas.ts";
import type { AuthService } from "./auth.service.ts";
import { toSessionJson, toUserJson } from "./auth.view.ts";

export class AuthController {
  readonly #auth: AuthService;

  constructor(auth: AuthService) {
    this.#auth = auth;
  }

  signup: RequestHandler = async (req, res) => {
    const session = await this.#auth.signup(req.body as Signup);
    res.status(201).location("/v1/me").json(toSessionJson(session));
  };

  login: RequestHandler = async (req, res) => {
    const { email, password } = req.body as Login;
    res.json(toSessionJson(await this.#auth.login(email, password)));
  };

  refresh: RequestHandler = async (req, res) => {
    const { refreshToken } = req.body as RefreshTokenBody;
    res.json(toSessionJson(await this.#auth.refresh(refreshToken)));
  };

  logout: RequestHandler = async (req, res) => {
    const { refreshToken } = req.body as RefreshTokenBody;
    await this.#auth.logout(refreshToken);
    res.status(204).end();
  };

  me: RequestHandler = async (req, res) => {
    res.json(toUserJson(await this.#auth.me(currentUser(req).id)));
  };
}

// The User model. A password is stored only as an argon2 hash: signup assigns the plain text to
// the password path, and the pre("save") hook replaces it with its hash, but only when the
// password actually changed, so saving a user after a name edit never re-hashes an existing
// hash. The password and the reset fields are select:false (kept out of query results) and the
// shared toJSON plugin removes them from any serialized output.
import argon2 from "argon2";
import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { now } from "../clock.ts";
import { toJsonPlugin } from "./plugins/to-json.ts";

export const USER_ROLES = ["member", "admin"] as const;

export interface UserDoc {
  email: string;
  name: string;
  password: string;
  role: (typeof USER_ROLES)[number];
  resetTokenHash: string | null;
  resetTokenExpires: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface UserMethods {
  verifyPassword(plain: string): Promise<boolean>;
}

export type UserModel = Model<UserDoc, Record<string, never>, UserMethods>;
export type User = HydratedDocument<UserDoc, UserMethods>;

const userSchema = new Schema<UserDoc, UserModel, UserMethods>(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "{VALUE} is not a valid email"],
    },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    // select:false keeps the hash out of normal reads; login asks for it with .select("+password").
    password: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "member" },
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpires: { type: Date, default: null, select: false },
  },
  { timestamps: { currentTime: () => now() } },
);

userSchema.index({ email: 1 }, { unique: true });

userSchema.pre("save", async function hashPassword(this: User) {
  // Hash only when the password changed, so a name or role edit leaves the stored hash alone.
  if (!this.isModified("password")) return;
  this.password = await argon2.hash(this.password);
});

userSchema.methods.verifyPassword = function verifyPassword(this: User, plain: string): Promise<boolean> {
  return argon2.verify(this.password, plain);
};

userSchema.plugin(toJsonPlugin);

export const UserModel = model<UserDoc, UserModel>("User", userSchema);

"use client";

import Link from "next/link";
import { Dropdown } from "./Dropdown";
import { SignOutButton } from "./SignOutButton";

export function AccountMenu({ name, email }: { name: string; email: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || email[0]?.toUpperCase();

  return (
    <Dropdown
      align="end"
      buttonClass="avatar-button"
      panelClass="menu account-menu"
      label={
        <>
          <span aria-hidden="true">{initials}</span>
          <span className="sr-only">Account menu</span>
        </>
      }
    >
      {(close) => (
        <>
          <div className="account-id">
            <strong>{name || "Your account"}</strong>
            <span className="mono">{email}</span>
          </div>
          <div className="menu-sep" />
          <Link href="/settings" className="menu-item" onClick={close}>
            Settings
          </Link>
          <SignOutButton className="menu-item" />
        </>
      )}
    </Dropdown>
  );
}

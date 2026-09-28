"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Button,
  Input,
  InputGroup,
  Label,
  TextField,
} from "@heroui/react";

import { login, ApiError } from "@/lib/auth";
import { storeSessionToken } from "@/lib/api";

export function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/overview";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("Username and password are required.");

      return;
    }
    setSubmitting(true);
    try {
      const res = await login(username.trim(), password);
      const token = res?.session_token || res?.token;

      if (token) storeSessionToken(token);
      if (res?.token) {
        try {
          window.localStorage.setItem("sheba_saas_legacy_token", res.token);
        } catch {
          /* ignore */
        }
      }
      window.location.href = nextPath;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Invalid credentials.");
        } else if (err.status === 403) {
          setError(
            "Your account is not a Platform Administrator. Access denied.",
          );
        } else {
          setError(err.message || `Login failed (HTTP ${err.status}).`);
        }
      } else {
        setError(
          err instanceof Error ? err.message : "Login failed. Please retry.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <TextField isRequired>
        <Label>Username</Label>
        <InputGroup>
          <InputGroup.Prefix className="hidden" />
          <Input
            autoComplete="username"
            disabled={submitting}
            name="username"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </InputGroup>
      </TextField>

      <TextField isRequired>
        <Label>Password</Label>
        <InputGroup>
          <Input
            autoComplete="current-password"
            disabled={submitting}
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </InputGroup>
      </TextField>

      {error ? (
        <Alert status="danger" title="Sign-in failed">
          {error}
        </Alert>
      ) : null}

      <Button isDisabled={submitting} type="submit" variant="primary">
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

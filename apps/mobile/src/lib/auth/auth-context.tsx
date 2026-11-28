import { AuthRequest, exchangeCodeAsync, fetchDiscoveryAsync, makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiClient } from '../api';
import { ContentCache, MemoryStore } from '../cache';
import { config } from '../config';
import { FileStore } from '../file-store';
import { KeycloakEndpoint } from './keycloak';
import { secureStore } from './secure-store';
import { SessionManager } from './session';

WebBrowser.maybeCompleteAuthSession();

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
}

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthValue {
  status: Status;
  profile: Profile | null;
  api: ApiClient;
  cache: ContentCache;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Redirection enregistrée dans le client Keycloak « sysmaster-mobile » (schéma propre à l'application). */
export const redirectUri = makeRedirectUri({ scheme: 'sysmaster', path: 'auth', native: 'sysmaster://auth' });

function createServices() {
  let store;
  try {
    store = new FileStore();
  } catch {
    store = new MemoryStore();
  }
  const cache = new ContentCache(store);
  const session = new SessionManager(secureStore, new KeycloakEndpoint(config.issuer, config.clientId));
  const api = new ApiClient({ baseUrl: config.apiUrl, cache, accessToken: (o) => session.accessToken(o) });
  return { cache, session, api };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ cache, session, api }] = useState(createServices);
  const [status, setStatus] = useState<Status>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setProfile((await api.get<Profile>('/me')).data);
    } catch {
      setProfile(null);
    }
  }, [api]);

  useEffect(() => {
    const off = session.onChange((signedIn) => {
      setStatus(signedIn ? 'signedIn' : 'signedOut');
      if (!signedIn) {
        setProfile(null);
        void cache.clear();
      }
    });
    void session.restore().then((ok) => {
      setStatus(ok ? 'signedIn' : 'signedOut');
      if (ok) void loadProfile();
    });
    return off;
  }, [session, cache, loadProfile]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      const discovery = await fetchDiscoveryAsync(config.issuer);
      // PKCE (S256) et paramètre state générés et vérifiés par AuthRequest.
      const request = new AuthRequest({
        clientId: config.clientId,
        redirectUri,
        responseType: ResponseType.Code,
        scopes: ['openid', 'profile', 'email'],
        usePKCE: true,
        extraParams: { ui_locales: 'fr' },
      });
      const result = await request.promptAsync(discovery, { preferEphemeralSession: false });
      if (result.type !== 'success') {
        if (result.type === 'error') setError(result.error?.message ?? 'La connexion a échoué.');
        return;
      }
      const tokens = await exchangeCodeAsync(
        { clientId: config.clientId, code: result.params.code ?? '', redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
        discovery,
      );
      await session.setTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? null,
        expiresAt: (tokens.issuedAt + (tokens.expiresIn ?? 60)) * 1000,
      });
      await loadProfile();
    } catch {
      setError('Connexion impossible pour le moment. Vérifiez votre réseau et réessayez.');
    }
  }, [session, loadProfile]);

  const signOut = useCallback(async () => {
    await session.signOut();
    await cache.clear();
  }, [session, cache]);

  const value = useMemo(
    () => ({ status, profile, api, cache, signIn, signOut, error }),
    [status, profile, api, cache, signIn, signOut, error],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé sous <AuthProvider>.');
  return value;
}

import { PrivyProvider, useIdentityToken, useLogin, usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";
import { authClient, finishSignIn } from "./authClient";

interface Props {
  appId: string;
  onError: (message: string) => void;
}

function Inner({ onError }: Omit<Props, "appId">) {
  const { ready, authenticated } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { login } = useLogin();
  const sent = useRef(false);

  // Once Privy has signed the visitor in, swap its identity token for our session.
  useEffect(() => {
    if (!authenticated || !identityToken || sent.current) return;
    sent.current = true;
    authClient
      .$fetch("/sign-in/privy", { method: "POST", body: { idToken: identityToken } })
      .then(({ data, error }) => {
        if (error) {
          sent.current = false;
          onError(error.message ?? "Privy sign-in failed.");
        } else finishSignIn(data);
      });
  }, [authenticated, identityToken, onError]);

  return (
    <button className="secondary" disabled={!ready} onClick={() => login()}>
      Continue with Privy (email, wallet)
    </button>
  );
}

export default function PrivyButton({ appId, onError }: Props) {
  return (
    <PrivyProvider appId={appId} config={{ loginMethods: ["email", "wallet", "google", "apple"] }}>
      <Inner onError={onError} />
    </PrivyProvider>
  );
}

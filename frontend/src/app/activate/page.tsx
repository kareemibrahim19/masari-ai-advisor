import { SignIn } from "../login/sign-in"

/** First sign-in, for a student with no password yet: the same screen as /login, on its "First time?" tab. */
export default function ActivatePage() {
  return <SignIn initial="activate" />
}

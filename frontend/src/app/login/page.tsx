import { SignIn } from "./sign-in"

/** Sign in (student ID + password). Visitors who are not signed in are sent here by the app shell. */
export default function LoginPage() {
  return <SignIn initial="login" />
}

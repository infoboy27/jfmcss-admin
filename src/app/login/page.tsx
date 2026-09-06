import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";
export default async function LoginPage(){if(await getSessionUser())redirect('/');return <LoginForm/>}

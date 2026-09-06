import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import LiveControl from "@/components/LiveControl";
export const dynamic='force-dynamic';
export default async function Page(){const user=await getSessionUser();if(!user)redirect('/login');return <LiveControl user={user}/>}

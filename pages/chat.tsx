import type { GetServerSideProps } from "next";
import Head from "next/head";

import type { AdminChatConfig } from "@/types/chat-config";
import { ChatShell } from "@/components/chat/ChatShell";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";

type PageProps = {
  adminConfig: AdminChatConfig;
};

export default function ChatPage({ adminConfig }: PageProps) {
  return (
    <>
      <Head>
        <title>Jack’s AI Assistant</title>
        <meta
          name="description"
          content="Ask Jack’s AI Assistant everything, now with session-level advanced settings."
        />
      </Head>
      <ChatShell adminConfig={adminConfig} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const adminConfig = await getAdminChatConfig();
  return {
    props: {
      adminConfig,
    },
  };
};

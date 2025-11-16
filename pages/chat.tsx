import type { GetServerSideProps } from "next";
import Head from "next/head";

import type { AdminChatConfig } from "@/types/chat-config";
import { AiPageChrome } from "@/components/AiPageChrome";
import { ChatShell } from "@/components/chat/ChatShell";
import { getAdminChatConfig } from "@/lib/server/admin-chat-config";
import {
  loadNotionNavigationHeader,
  type NotionNavigationHeader,
} from "@/lib/server/notion-header";

type PageProps = {
  adminConfig: AdminChatConfig;
} & NotionNavigationHeader;

export default function ChatPage({
  adminConfig,
  headerRecordMap,
  headerBlockId,
}: PageProps) {
  return (
    <>
      <Head>
        <title>Jack’s AI Assistant</title>
        <meta
          name="description"
          content="Ask Jack’s AI Assistant everything, now with session-level advanced settings."
        />
      </Head>
      <AiPageChrome
        headerRecordMap={headerRecordMap}
        headerBlockId={headerBlockId}
      >
        <ChatShell adminConfig={adminConfig} />
      </AiPageChrome>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const [adminConfig, header] = await Promise.all([
    getAdminChatConfig(),
    loadNotionNavigationHeader(),
  ]);
  return {
    props: {
      adminConfig,
      ...header,
    },
  };
};

import { REST, Routes, SlashCommandBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN!;
// Decode APPLICATION_ID from bot token (first segment is base64-encoded bot user ID)
const APPLICATION_ID = Buffer.from(TOKEN.split(".")[0], "base64").toString();

const commands = [
  new SlashCommandBuilder()
    .setName("reset")
    .setDescription("Clear session, start fresh conversation"),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show bot status and session info"),

  new SlashCommandBuilder()
    .setName("memory")
    .setDescription("Show stored facts and goals"),

  new SlashCommandBuilder()
    .setName("forget")
    .setDescription("Clear all memories"),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("Show recent conversation history")
    .addIntegerOption((opt) =>
      opt
        .setName("count")
        .setDescription("Number of messages to show (default: 10, max: 50)")
        .setMinValue(1)
        .setMaxValue(50)
    ),

  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Search past messages")
    .addStringOption((opt) =>
      opt
        .setName("query")
        .setDescription("Search keyword")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("coin")
    .setDescription("코인 자동매매 서버 요약 정보 조회"),

  new SlashCommandBuilder()
    .setName("blog")
    .setDescription("블로그 콘텐츠 파이프라인 실행 (글감 수집 → 작성 → 검토)")
    .addStringOption((opt) =>
      opt
        .setName("stage")
        .setDescription("특정 단계만 실행 (기본: 전체)")
        .addChoices(
          { name: "전체 파이프라인", value: "all" },
          { name: "1. 글감 수집 (Research)", value: "research" },
          { name: "2. 글 작성 (Write)", value: "write" },
          { name: "3. 검토 (Review)", value: "review" },
          { name: "4. 알림 (Notify)", value: "notify" },
        )
    ),

  new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("예약 작업 관리 (조회/추가/삭제/토글)")
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("예약된 작업 목록 조회")
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("새 예약 작업 추가")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("작업 이름").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("interval").setDescription("실행 간격 (분)").setRequired(true).setMinValue(5)
        )
        .addStringOption((opt) =>
          opt.setName("prompt").setDescription("실행할 프롬프트").setRequired(true)
        )
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("대상 채널 (기본: 현재 채널)")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("예약 작업 삭제")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("작업 ID (앞 8자리)").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("toggle")
        .setDescription("예약 작업 활성화/비활성화")
        .addStringOption((opt) =>
          opt.setName("id").setDescription("작업 ID (앞 8자리)").setRequired(true)
        )
    ),
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function main() {
  console.log(`Registering slash commands for application ${APPLICATION_ID}...`);
  await rest.put(Routes.applicationCommands(APPLICATION_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log("Done. Commands registered globally.");
}

main().catch(console.error);

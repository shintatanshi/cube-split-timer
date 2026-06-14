import { getSupabaseClient, isSupabaseConfigured, type Database } from "./supabase";

export type FeedbackCategory = Database["public"]["Tables"]["feedback_reports"]["Row"]["category"];

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  message: string;
  contact?: string;
  pagePath?: string;
  currentScramble?: string;
  timerMode?: string;
}

export async function submitFeedbackReport(input: SubmitFeedbackInput): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }

  const message = input.message.trim();

  if (!message) {
    throw new Error("Feedback message is required.");
  }

  const contact = input.contact?.trim() || null;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("feedback_reports").insert({
    category: input.category,
    message,
    contact,
    page_path: input.pagePath ?? window.location.pathname,
    current_scramble: input.currentScramble?.trim() || null,
    timer_mode: input.timerMode ?? null,
    user_agent: navigator.userAgent,
  });

  if (error) {
    throw error;
  }
}

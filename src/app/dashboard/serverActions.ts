"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createSkuAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();

  if (!name) {
    throw new Error("请填写教程名称");
  }

  await supabase.from("users").upsert({ id: user.id, email: user.email });

  const { error } = await supabase.from("skus").insert({
    user_id: user.id,
    name,
    description,
    is_active: true
  });

  if (error) throw error;
  redirect(`/dashboard`);
}

export async function createStepAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const skuId = String(formData.get("sku_id") || "").trim();
  const step_name = String(formData.get("step_name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const youtube_url = String(formData.get("youtube_url") || "").trim();
  const start_time = Number(formData.get("start_time") || 0);
  const end_time = Number(formData.get("end_time") || 0);

  if (!skuId || !step_name || !youtube_url) {
    throw new Error("请填写步骤名称与 YouTube 链接");
  }
  if (!Number.isFinite(start_time) || !Number.isFinite(end_time) || end_time <= start_time) {
    throw new Error("结束时间（秒）必须大于开始时间（秒）");
  }

  const { data: owned } = await supabase
    .from("skus")
    .select("id")
    .eq("id", skuId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!owned) {
    throw new Error("无权在此教程下添加步骤");
  }

  const { data: last } = await supabase
    .from("steps")
    .select("step_number")
    .eq("sku_id", skuId)
    .order("step_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const step_number = (last?.step_number ?? 0) + 1;

  const { error } = await supabase.from("steps").insert({
    sku_id: skuId,
    step_number,
    step_name,
    description,
    youtube_url,
    start_time: Math.max(0, Math.floor(start_time)),
    end_time: Math.floor(end_time)
  });

  if (error) throw error;
  redirect(`/dashboard`);
}

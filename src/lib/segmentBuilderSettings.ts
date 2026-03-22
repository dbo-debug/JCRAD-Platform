import { createAdminClient } from "@/lib/supabase/admin";
import { SEGMENT_BUILDER_SETTINGS_FIELDS, valuesFromRows, type AppSettingRow } from "@/lib/appSettingsRegistry";

export type SegmentBuilderSettings = {
  route_planner_default_start_time: string;
  route_planner_default_required_return_time: string;
  route_planner_default_max_stops: number;
  route_planner_default_visit_minutes: number;
  route_planner_default_lunch_minutes: number;
  route_planner_fallback_drive_mph: number;
};

export async function loadSegmentBuilderSettings(): Promise<SegmentBuilderSettings> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value_json")
    .in("key", SEGMENT_BUILDER_SETTINGS_FIELDS.map((field) => field.key));

  if (error) {
    return valuesFromRows(SEGMENT_BUILDER_SETTINGS_FIELDS, []) as SegmentBuilderSettings;
  }

  return valuesFromRows(SEGMENT_BUILDER_SETTINGS_FIELDS, (data || []) as AppSettingRow[]) as SegmentBuilderSettings;
}

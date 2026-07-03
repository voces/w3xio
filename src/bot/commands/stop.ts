import { deleteAlert } from "../alerts.ts";
import { InternalHandler } from "../types.ts";

export const handleStop: InternalHandler = async (
  { channelId, channelName },
) => {
  const result = await deleteAlert(channelId);

  if ("errors" in result) {
    if (result.errors[0].code === "missing_alert") return "No alert found";
    return "Error deleting alert";
  }

  console.log(new Date(), "Removed alert", { channelId, channelName });
  return "Deleted alert";
};

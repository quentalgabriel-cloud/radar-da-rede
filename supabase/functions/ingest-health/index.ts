import { handleIngest } from "../_shared/handler.ts";

Deno.serve((request) => handleIngest(request, "health"));


import { buildSchema } from "npm:graphql";

const watchMode = await Deno.readTextFile(`/proc/${Deno.pid}/cmdline`).then((
  v,
) => v.split("\u0000").includes("--watch")).catch(() => false);
if (watchMode) {
  const wrapper = async <T>(
    asyncIterable: AsyncIterable<T>,
    callback: (value: T) => void,
  ) => {
    const iterator = asyncIterable[Symbol.asyncIterator](); // Obtain the iterator

    try {
      while (true) {
        const { value, done } = await iterator.next(); // Get next value
        if (done) break; // Exit if the iterable is exhausted
        callback(value); // Call the callback with the current value
      }
    } catch (error) {
      console.error("Error processing async iterable:", error);
    }
  };

  wrapper(
    Deno.watchFs("./src/gapi/schema.gql"),
    async (v) => {
      if (v.kind !== "access") return;
      try {
        buildSchema(await Deno.readTextFile("./src/gapi/schema.gql"));
        new Deno.Command(Deno.execPath(), {
          args: ["task", "codegen"],
          stdout: "piped",
          stderr: "piped",
        })
          .outputSync();
      } catch (err) {
        console.error(err.message);
      }
    },
  );
}

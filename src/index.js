import { createClient } from "@supabase/supabase-js";
import { getSudoku } from "sudoku-gen";

export default {
  async fetch(request, env, ctx) {
    console.log("Fetch request received");
    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_KEY = env.SUPABASE_KEY;

    const url = new URL(request.url);
    const forceRun = url.searchParams.get("forceRun");
    const key = url.searchParams.get("key");

    if (forceRun === "true") {
      console.log("Force run requested");
      try {
        const result = await storePuzzles(env, SUPABASE_URL, SUPABASE_KEY);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error in forceRun:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (key) {
      console.log(`Requested key: ${key}`);
      try {
        const sudokuValue = await env.KV_PUZZLES.get(`sudoku:${key}`);
        const wordleValue = await env.KV_PUZZLES.get(`wordle:${key}`);

        if (sudokuValue === null && wordleValue === null) {
          console.log(`Error: No puzzles found for key: ${key}`);
          return new Response("Not found", { status: 404 });
        }

        const response = {
          sudoku: sudokuValue ? JSON.parse(sudokuValue) : null,
          wordle: wordleValue || null,
        };

        console.log(`Returning puzzles for key: ${key}`);
        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Error fetching puzzles:", error);
        return new Response("Error fetching puzzles", { status: 500 });
      }
    }

    return new Response("Invalid request", { status: 400 });
  },

  async scheduled(controller, env, ctx) {
    console.log("Scheduled task started");
    ctx.waitUntil(storePuzzles(env, env.SUPABASE_URL, env.SUPABASE_KEY));
  },
};

async function storePuzzles(env, SUPABASE_URL, SUPABASE_KEY) {
  console.log("Starting storePuzzles function");

  console.log("Creating Supabase client");
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const date = new Date().toISOString().split("T")[0];
  console.log(`Generated date: ${date}`);

  console.log("Checking if Sudoku puzzle for today's date already exists");
  const { data: existingSudoku, error: existingSudokuError } = await supabase
    .from("sudoku_puzzles")
    .select("*")
    .eq("date", date)
    .single();

  if (existingSudoku) {
    console.log(
      "Sudoku puzzle for today's date already exists. Skipping insert."
    );
  } else {
    console.log("Generating Sudoku puzzle");
    const sudoku = generateSudoku();
    console.log("Storing Sudoku puzzle in Cloudflare KV");
    try {
      await env.KV_PUZZLES.put(`sudoku:${date}`, JSON.stringify(sudoku));
      const { data: sudokuData, error: sudokuError } = await supabase
        .from("sudoku_puzzles")
        .insert({
          date: date,
          puzzle: sudoku.puzzle,
          solution: sudoku.solution,
        });
      if (sudokuError) throw sudokuError;
      console.log("Supabase Sudoku insert result:", sudokuData);
    } catch (error) {
      console.error("Error storing Sudoku puzzle:", error);
      throw error;
    }
  }

  console.log("Checking if Wordle puzzle for today's date already exists");
  const { data: existingWordle, error: existingWordleError } = await supabase
    .from("wordle_puzzles")
    .select("*")
    .eq("date", date)
    .single();

  if (existingWordle) {
    console.log(
      "Wordle puzzle for today's date already exists. Skipping insert."
    );
  } else {
    console.log("Generating Wordle puzzle");
    const wordle = await generateWordle();
    console.log("Storing Wordle puzzle in Cloudflare KV");
    try {
      await env.KV_PUZZLES.put(`wordle:${date}`, wordle);
      const { data: wordleData, error: wordleError } = await supabase
        .from("wordle_puzzles")
        .insert({
          date: date,
          word: wordle,
        });
      if (wordleError) throw wordleError;
      console.log("Supabase Wordle insert result:", wordleData);
    } catch (error) {
      console.error("Error storing Wordle puzzle:", error);
      throw error;
    }
  }

  console.log("Puzzles stored successfully");
  return { message: "Puzzles stored successfully" };
}

function generateSudoku() {
  console.log("Generating Sudoku puzzle");
  const puzzle = getSudoku("easy");
  return {
    puzzle: puzzle.puzzle,
    solution: puzzle.solution,
  };
}

async function generateWordle() {
  console.log("Generating Wordle puzzle");
  try {
    const response = await fetch(
      "https://api.datamuse.com/words?sp=?????&max=1"
    );
    const words = await response.json();
    if (words.length > 0) {
      return words[0].word.toUpperCase();
    } else {
      throw new Error("No word found");
    }
  } catch (error) {
    console.error("Error fetching word from Datamuse API:", error);
    throw new Error("Failed to generate Wordle word");
  }
}

import { interview } from "./server";

export async function fetchRandomUser(query = ""): Promise<interview | null> {
  const res = await fetch(`http://localhost:3000/interviews/?${query}`);
  const interviews: interview[] = await res.json();

  if (!interviews.length) return null;

  const randomIndex = Math.floor(Math.random() * interviews.length);
  return interviews[randomIndex];
}

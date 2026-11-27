import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Isologo } from "./isologo";
import { ISOLOGO } from "./trazos";

describe("Isologo", () => {
  it("dibuja los dos trazos del isologo: el arco con la crin y la cabeza", () => {
    const { container } = render(<Isologo alto={30} />);
    expect(ISOLOGO).toHaveLength(2);
    expect(container.querySelectorAll("path")).toHaveLength(2);
    expect(screen.getByRole("img", { name: "EQUUS" })).toBeInTheDocument();
  });
});

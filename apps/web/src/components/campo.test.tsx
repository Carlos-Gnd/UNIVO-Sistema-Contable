import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@/components/ui/input";
import { Campo } from "./campo";

describe("<Campo>", () => {
  it("enlaza la etiqueta y la ayuda con el control", () => {
    render(
      <Campo id="nrc" etiqueta="NRC" ayuda="000000-0">
        {(props) => <Input {...props} />}
      </Campo>,
    );
    const control = screen.getByLabelText("NRC");
    expect(control).toHaveAccessibleDescription("000000-0");
    expect(control).toHaveAttribute("aria-invalid", "false");
  });

  it("muestra el error en lugar de la ayuda y marca el control", () => {
    render(
      <Campo id="nrc" etiqueta="NRC" ayuda="000000-0" error="El NRC debe tener el formato 000000-0.">
        {(props) => <Input {...props} />}
      </Campo>,
    );
    const control = screen.getByLabelText("NRC");
    expect(control).toHaveAccessibleDescription("El NRC debe tener el formato 000000-0.");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("000000-0")).not.toBeInTheDocument();
  });
});

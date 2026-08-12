// Aviso honesto para pestañas de Producción que todavia no tienen contenido real
// portado de DIGITALIZACION -- ver el plan de fases en
// C:\Users\LENOVO\.claude\plans\virtual-sauteeing-kurzweil.md.

export default function ProximaFaseView({ titulo, incluye, motivo }) {
  return (
    <section className="etiquetas-section">
      <div className="panel">
        <div className="section-heading">
          <div>
            <span>Produccion</span>
            <h2>{titulo}</h2>
          </div>
        </div>
        <p>
          Esta pestaña va a incluir <strong>{incluye}</strong> de DIGITALIZACION, pero todavia no
          esta portada -- se esta haciendo por fases para no romper nada. {motivo}
        </p>
      </div>
    </section>
  );
}

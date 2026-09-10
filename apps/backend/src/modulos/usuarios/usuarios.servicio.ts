// Accesos al panel: quiénes son y quién puede entrar.
//
// Las invitaciones las emite `AutenticacionServicio`, que es el dueño de los
// tokens; acá se administra el resto: listar, dar de baja y atar a cada
// profesional con su usuario.
import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  cambiarActivo,
  listarUsuarios,
  vincularProfesionalConUsuario,
  type BaseDatos,
} from '@manly/base-datos';
import type { Invitacion, UsuarioPanel, UsuarioSesion } from '@manly/contratos';

import { BASE_DATOS } from '../../comun/base-datos/base-datos.modulo';
import { AutenticacionServicio } from '../autenticacion/autenticacion.servicio';

@Injectable()
export class UsuariosServicio {
  constructor(
    @Inject(BASE_DATOS) private readonly bd: BaseDatos,
    private readonly autenticacion: AutenticacionServicio,
  ) {}

  async listar(): Promise<UsuarioPanel[]> {
    const usuarios = await listarUsuarios(this.bd);

    return usuarios.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo,
      // Sin hash de contraseña la invitación sigue sin aceptarse: la persona
      // existe pero todavía no puede entrar.
      acceso: usuario.hashContrasenia !== null,
      profesionalId: usuario.profesionalId,
    }));
  }

  invitar(datos: Invitacion): Promise<{ url: string; usuarioId: string }> {
    return this.autenticacion.invitar(datos);
  }

  /**
   * Da de alta o de baja un acceso.
   *
   * No se puede dar de baja a sí mismo: sería la forma más fácil de dejar el
   * panel sin nadie que pueda entrar, y no hay registro público para recuperarse
   * de eso.
   */
  async cambiarActivo(
    usuarioId: string,
    activo: boolean,
    quienLoPide: UsuarioSesion,
  ): Promise<void> {
    if (usuarioId === quienLoPide.id && !activo) {
      throw new ForbiddenException('No podés darte de baja a vos mismo.');
    }

    if (!activo && (await this.esElUltimoDeGerencia(usuarioId))) {
      throw new BadRequestException(
        'Es la única cuenta de gerencia activa. Invitá a otra antes de darla de baja.',
      );
    }

    await cambiarActivo(this.bd, usuarioId, activo);
  }

  async vincular(profesionalId: string, usuarioId: string | null): Promise<void> {
    if (!(await vincularProfesionalConUsuario(this.bd, profesionalId, usuarioId))) {
      throw new BadRequestException('No encontramos ese profesional.');
    }
  }

  /** Si dar de baja a este usuario dejaría al panel sin gerencia. */
  private async esElUltimoDeGerencia(usuarioId: string): Promise<boolean> {
    const usuarios = await listarUsuarios(this.bd);
    const gerencia = usuarios.filter(
      (usuario) => usuario.rol === 'gerencia' && usuario.activo && usuario.hashContrasenia !== null,
    );

    return gerencia.length === 1 && gerencia[0]?.id === usuarioId;
  }
}

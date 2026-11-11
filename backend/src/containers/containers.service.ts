import { Injectable, NotFoundException } from '@nestjs/common';
import { ContainersRepository } from './containers.repository';
import { toListItem, toReading } from './containers.response';
import type {
  ContainerListItemDto,
  ContainerPageDto,
  ContainerQueryDto,
  ContainerReadingDto,
  ContainerReadingsQueryDto,
} from './dto/containers.dto';

@Injectable()
export class ContainersService {
  constructor(private readonly repository: ContainersRepository) {}

  async list(query: ContainerQueryDto, sada = new Date()): Promise<ContainerPageDto> {
    const rows = await this.repository.page(query);
    const saStanjem = query.sa_stanjem === true;

    return {
      // The repository asks for one row more than the page size; that row is
      // never returned, it only answers whether another page exists.
      items: rows.slice(0, query.limit).map((row) => toListItem(row, saStanjem, sada)),
      page: query.page,
      limit: query.limit,
      hasMore: rows.length > query.limit,
    };
  }

  /** The detail view always carries state and forecast: that is what it is for. */
  async get(id: string, sada = new Date()): Promise<ContainerListItemDto> {
    const row = await this.repository.byId(id);
    if (row === undefined) throw new NotFoundException('No container with that id');

    return toListItem(row, true, sada);
  }

  async readings(id: string, query: ContainerReadingsQueryDto): Promise<ContainerReadingDto[]> {
    // An empty history is a legitimate answer for a container with no sensor, so
    // the container's existence is checked rather than inferred from the rows.
    const row = await this.repository.byId(id);
    if (row === undefined) throw new NotFoundException('No container with that id');

    return (await this.repository.ocitavanja(id, query)).map(toReading);
  }
}
